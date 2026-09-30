import { HttpClient, defaultHttpClient } from '../http-client';

export interface InventoryPart {
  id: number;
  sku: string;
  name: string;
  category: string;
  stock_quantity: number;
  min_stock_alert: number;
  unit_price: number;
  cost_price?: number;
  compatible_models?: string | string[];
  location?: string;
  is_active?: boolean;
  inventory_transactions?: InventoryTransactionItem[];
  created_at?: string;
  updated_at?: string;
}

export interface InventoryTransactionItem {
  id: number;
  part_id: number;
  branch_id: number;
  repair_order_id?: number | null;
  transaction_type: 'import' | 'export_repair' | 'export_damage' | 'adjust_inventory' | string;
  quantity: number;
  unit_cost?: number | null;
  supplier_name?: string | null;
  notes?: string | null;
  created_by_user_id?: number | null;
  created_at?: string;
  part?: Partial<InventoryPart>;
  branch?: { id: number; name: string; code?: string };
  repair_order?: { id: number; order_code: string };
  created_by_user?: { id: number; name: string };
}

export interface CreateInventoryTransactionDTO {
  part_id: number | string;
  branch_id: number | string;
  transaction_type: 'import' | 'export_repair' | 'export_damage' | 'adjust_inventory' | string;
  quantity: number;
  unit_cost?: number;
  supplier_name?: string;
  notes?: string;
  repair_order_id?: number | string | null;
}

export class InventoryService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getParts(params?: {
    category?: string;
    low_stock?: boolean;
    q?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/inventory/parts', {
      params: {
        ...params,
        q: params?.q || params?.search,
      },
    });
  }

  async getPartById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/inventory/parts/${id}`);
  }

  async getTransactions(params?: {
    part_id?: string | number;
    transaction_type?: string;
    branch_id?: string | number;
    page?: number;
    per_page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/inventory/transactions', { params });
  }

  async createTransaction(dto: CreateInventoryTransactionDTO): Promise<any> {
    return this.http.post('/api/v1/inventory/transactions', dto);
  }
}

export const inventoryService = new InventoryService();
