import { HttpClient, defaultHttpClient } from '../http-client';

export interface PaymentItem {
  id: number;
  payment_code: string;
  repair_order_id: number;
  received_by_user_id?: number | null;
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'card_pos' | 'wallet' | string;
  status: 'pending' | 'completed' | 'paid' | 'refunded' | 'failed' | string;
  transaction_ref?: string | null;
  notes?: string | null;
  paid_at?: string | null;
  created_at?: string;
  repair_order?: {
    id: number;
    order_code: string;
    customer?: {
      id: number;
      name: string;
      phone: string;
    };
  };
  received_by_user?: {
    id: number;
    name: string;
  };
}

export interface CreatePaymentDTO {
  repair_order_id: number | string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'card_pos' | 'wallet' | string;
  transaction_ref?: string;
  notes?: string;
}

export class PaymentService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getPayments(params?: {
    repair_order_id?: number | string;
    payment_method?: string;
    per_page?: number;
    page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/payments', { params });
  }

  async createPayment(dto: CreatePaymentDTO): Promise<any> {
    return this.http.post('/api/v1/payments', dto);
  }
}

export const paymentService = new PaymentService();
