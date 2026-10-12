export interface Supplier {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  tax_code?: string | null;
  debt_balance: number | string;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  goods_receipts_count?: number;
}

export interface CreateSupplierDTO {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  tax_code?: string;
  code?: string;
  notes?: string;
  is_active?: boolean;
}

export interface UpdateSupplierDTO extends Partial<CreateSupplierDTO> {}

export interface SupplierDebtTransaction {
  id: number;
  tenant_id: number;
  branch_id?: number | null;
  supplier_id: number;
  goods_receipt_id?: number | null;
  cash_transaction_id?: number | null;
  transaction_code: string;
  transaction_type: 'purchase_debt' | 'debt_payment' | 'adjustment';
  amount: number | string;
  debt_before: number | string;
  debt_after: number | string;
  payment_method?: 'cash' | 'bank_transfer' | null;
  notes?: string | null;
  created_by_user_id: number;
  created_at?: string;
  updated_at?: string;
  supplier?: Supplier;
  goods_receipt?: GoodsReceipt;
  created_by_user?: { id: number; name: string; email?: string };
  branch?: { id: number; name: string; code?: string };
}

export interface RepaySupplierDebtDTO {
  amount: number;
  payment_method: 'cash' | 'bank_transfer';
  branch_id?: number;
  notes?: string;
}

export interface GoodsReceiptItem {
  id: number;
  goods_receipt_id: number;
  part_id: number;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  created_at?: string;
  part?: {
    id: number;
    sku: string;
    name: string;
    cost_price?: number | string;
    retail_price?: number | string;
    unit?: string;
  };
}

export interface GoodsReceipt {
  id: number;
  tenant_id: number;
  branch_id: number;
  supplier_id: number;
  receipt_code: string;
  status: 'draft' | 'completed' | 'cancelled';
  total_amount: number | string;
  discount_amount: number | string;
  final_amount: number | string;
  paid_amount: number | string;
  debt_amount: number | string;
  payment_method?: 'cash' | 'bank_transfer' | 'none' | null;
  cash_transaction_id?: number | null;
  notes?: string | null;
  created_by_user_id: number;
  created_at?: string;
  updated_at?: string;
  supplier?: Supplier;
  branch?: { id: number; name: string; code?: string };
  items?: GoodsReceiptItem[];
  created_by_user?: { id: number; name: string };
}

export interface CreateGoodsReceiptItemDTO {
  part_id: number;
  quantity: number;
  unit_price: number;
}

export interface CreateGoodsReceiptDTO {
  supplier_id: number;
  branch_id?: number;
  items: CreateGoodsReceiptItemDTO[];
  discount_amount?: number;
  paid_amount?: number;
  payment_method?: 'cash' | 'bank_transfer' | 'none';
  notes?: string;
}
