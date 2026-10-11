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

export interface PaymentFilterDTO {
  repair_order_id?: number | string;
  order_code?: string;
  payment_method?: string;
  date?: string;
  per_page?: number;
  page?: number;
  [key: string]: any;
}

export interface CreatePaymentDTO {
  repair_order_id: number | string;
  amount: number;
  payment_method: 'cash' | 'bank_transfer' | 'card_pos' | 'wallet' | string;
  transaction_ref?: string;
  notes?: string;
}
