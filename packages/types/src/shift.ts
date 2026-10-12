export type ShiftStatus = 'open' | 'closed';

export type CashTransactionType = 'income' | 'expense';

export type ExpenseCategoryKey =
  | 'purchasing_parts'
  | 'shipping_cod'
  | 'store_operations'
  | 'refund'
  | 'other_expense';

export type IncomeCategoryKey = 'opening_float' | 'other_income';

export interface WorkShift {
  id: number;
  tenant_id: number;
  branch_id: number;
  shift_code: string;
  cashier_id: number;
  opened_at: string;
  closed_at?: string | null;
  status: ShiftStatus;
  opening_cash: number;
  system_cash_in: number;
  system_cash_out: number;
  expected_cash: number | string;
  vietqr_total?: number;
  orders_completed_count?: number;
  has_active_shift?: boolean;
  actual_cash?: number | null;
  difference_amount?: number | null;
  carried_over_cash?: number | null;
  deposited_cash?: number | null;
  reconciliation_notes?: string | null;
  closed_by_user_id?: number | null;
  cashier?: {
    id: number;
    name: string;
    role?: string;
    phone?: string;
  };
  closed_by?: {
    id: number;
    name: string;
    role?: string;
  };
  branch?: {
    id: number;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
  };
  cash_transactions?: CashTransaction[];
  created_at?: string;
  updated_at?: string;
}

export interface CashTransaction {
  id: number;
  tenant_id: number;
  branch_id: number;
  shift_id?: number | null;
  transaction_code: string;
  type: CashTransactionType;
  category: string;
  payment_method: 'cash' | 'bank_transfer' | string;
  amount: number;
  recipient_payer?: string | null;
  notes?: string | null;
  created_by_user_id: number;
  created_at?: string;
  updated_at?: string;
  work_shift?: {
    id: number;
    shift_code: string;
    status?: string;
  };
  created_by_user?: {
    id: number;
    name: string;
    role?: string;
  };
  creator?: {
    id: number;
    name: string;
    role?: string;
  };
  branch?: {
    id: number;
    name: string;
    code?: string;
  };
}

export interface ShiftTotals {
  opening_cash: number;
  system_cash_in: number;
  system_cash_out: number;
  expected_cash: number;
  actual_cash: number | null;
  difference_amount: number;
  carried_over_cash: number;
  deposited_cash: number;
}

export interface CategoryBreakdownItem {
  count: number;
  total: number;
}

export interface ShiftReconciliationSummary {
  shift: WorkShift;
  branch?: {
    id: number;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
  };
  tenant?: {
    id: number;
    name: string;
    code?: string;
  };
  cashier?: {
    id: number;
    name: string;
    role?: string;
    phone?: string;
  };
  closed_by?: {
    id: number;
    name: string;
    role?: string;
  };
  totals: ShiftTotals;
  income_by_category: Record<string, CategoryBreakdownItem>;
  expense_by_category: Record<string, CategoryBreakdownItem>;
  total_income_count: number;
  total_expense_count: number;
  formatted_dates: {
    opened_at?: string;
    closed_at?: string;
  };
}

export type ShiftPrintData = ShiftReconciliationSummary;

export interface BranchCashBalance {
  has_active_shift: boolean;
  active_shift_code?: string | null;
  current_cash_balance: number;
  opening_cash: number;
  system_cash_in: number;
  system_cash_out: number;
}

export interface OpenShiftDTO {
  branch_id?: number | string;
  opening_cash: number;
  notes?: string;
}

export interface CloseShiftDTO {
  actual_cash: number;
  carried_over_cash?: number;
  notes?: string;
}

export interface CreateExpenseDTO {
  branch_id?: number | string;
  amount: number;
  category: ExpenseCategoryKey | string;
  recipient_payer?: string;
  payment_method?: 'cash' | 'bank_transfer' | string;
  notes?: string;
}

export interface CashTransactionCategory {
  key: string;
  label: string;
}

export interface CashCategoriesResponse {
  expense: CashTransactionCategory[];
  income: CashTransactionCategory[];
}

export interface ShiftFilterParams {
  branch_id?: number | string;
  status?: ShiftStatus | string;
  from_date?: string;
  to_date?: string;
  page?: number;
  per_page?: number;
}

export interface CashTransactionFilterParams {
  branch_id?: number | string;
  shift_id?: number | string;
  type?: CashTransactionType | string;
  category?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  per_page?: number;
}

export interface CurrentShiftSnapshot extends WorkShift {
  vietqr_total?: number;
  orders_completed_count?: number;
  has_active_shift?: boolean;
}

export interface CurrentShiftResponse {
  success: boolean;
  message: string;
  data: CurrentShiftSnapshot | null;
  has_active_shift: boolean;
}
