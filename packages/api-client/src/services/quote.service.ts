import { HttpClient, defaultHttpClient } from '../http-client';

export interface QuoteItemRecord {
  id: number;
  quote_id: number;
  service_id?: number | null;
  part_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface QuoteRecord {
  id: number;
  repair_order_id: number;
  quote_number: string;
  total_amount: number;
  warranty_terms_days: number;
  note: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | string;
  decline_reason?: string | null;
  sent_by_user_id?: number | null;
  sent_at?: string | null;
  responded_at?: string | null;
  created_at?: string;
  items?: QuoteItemRecord[];
  repair_order?: {
    id: number;
    order_code: string;
    customer?: {
      id: number;
      name: string;
      phone: string;
    };
  };
  sent_by_user?: {
    id: number;
    name: string;
  };
}

export interface CreateQuoteItemDTO {
  service_id?: number | string | null;
  part_id?: number | string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CreateQuoteDTO {
  repair_order_id: number | string;
  note: string;
  warranty_terms_days?: number;
  items: CreateQuoteItemDTO[];
}

export class QuoteService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getQuotes(params?: {
    repair_order_id?: string | number;
    status?: string;
    page?: number;
    per_page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/quotes', { params });
  }

  async createQuote(dto: CreateQuoteDTO): Promise<any> {
    return this.http.post('/api/v1/quotes', dto);
  }

  async approve(id: string | number): Promise<any> {
    return this.http.post(`/api/v1/quotes/${id}/approve`);
  }

  async reject(id: string | number, payload: string | { reason: string }): Promise<any> {
    const body = typeof payload === 'string' ? { reason: payload } : payload;
    return this.http.post(`/api/v1/quotes/${id}/reject`, body);
  }
}

export const quoteService = new QuoteService();
