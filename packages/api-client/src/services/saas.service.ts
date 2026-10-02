import { HttpClient, defaultHttpClient } from '../http-client';

export interface SubscriptionTenantInfo {
  id: number;
  code: string;
  name: string;
  status: string;
  plan: string;
  expires_at: string | null;
  trial_ends_at: string | null;
  billing_cycle: string | null;
  days_remaining: number | null;
}

export interface SubscriptionPlanItem {
  id: string;
  code: string;
  name: string;
  price: number;
  price_monthly: number;
  price_yearly: number;
  max_branches: number | null;
  max_users: number | null;
  max_orders_per_month: number | null;
  features?: string[] | null;
  is_active: boolean;
  sort_order: number;
}

export interface QuotaMetric {
  used: number;
  limit: number | null;
  unlimited: boolean;
  percentage: number;
}

export interface SaasUsage {
  branches: QuotaMetric;
  users: QuotaMetric;
  orders: QuotaMetric;
  subscription: {
    plan_id: string;
    plan_name: string;
    status: string;
    expires_at: string | null;
    trial_ends_at: string | null;
    days_remaining: number | null;
    is_active: boolean;
    is_expired: boolean;
  };
}

export interface SaasCurrentResponse {
  success: boolean;
  data: {
    tenant: SubscriptionTenantInfo;
    current_plan: SubscriptionPlanItem;
    usage: SaasUsage;
    available_plans: SubscriptionPlanItem[];
  };
  message?: string;
}

export interface SubscribePayload {
  plan_id: string;
  billing_cycle?: 'monthly' | 'yearly';
}

export interface SubscribeResponseData {
  invoice_id: number;
  reference_code: string;
  amount: number;
  plan: {
    id: string;
    name: string;
    code: string;
  };
  billing_cycle: string;
  account_number: string;
  bank_code: string;
  account_holder?: string;
  qr_url: string;
  expires_at: string | null;
  status: string;
}

export interface SubscribeResponse {
  success: boolean;
  data: SubscribeResponseData;
  message?: string;
}

export interface InvoiceStatusResponseData {
  id: number;
  reference_code: string;
  status: 'pending' | 'paid' | 'cancelled' | 'expired' | string;
  amount: number;
  plan: string;
  plan_name?: string;
  paid_at: string | null;
  expires_at: string | null;
}

export interface InvoiceStatusResponse {
  success: boolean;
  data: InvoiceStatusResponseData;
  message?: string;
}

export class SaasService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  /**
   * Lấy thông tin gói cước hiện tại và tình hình sử dụng hạn mức (quota)
   */
  async getCurrent(): Promise<SaasCurrentResponse> {
    return this.http.get('/api/v1/saas/current');
  }

  /**
   * Lấy danh sách tất cả các gói cước đang kích hoạt
   */
  async getPlans(): Promise<{ success: boolean; data: SubscriptionPlanItem[] }> {
    return this.http.get('/api/v1/saas/plans');
  }

  /**
   * Khởi tạo yêu cầu nâng cấp gói / thanh toán bản quyền qua SePay VietQR
   */
  async subscribe(payload: SubscribePayload): Promise<SubscribeResponse> {
    return this.http.post('/api/v1/saas/subscribe', payload);
  }

  /**
   * Tra cứu trạng thái hóa đơn theo reference_code phục vụ Polling
   */
  async getInvoiceStatus(refCode: string): Promise<InvoiceStatusResponse> {
    return this.http.get(`/api/v1/saas/invoices/${refCode}/status`);
  }
}

export const saasService = new SaasService();
