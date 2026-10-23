import { HttpClient, defaultHttpClient } from '../http-client';
import type {
  Supplier,
  CreateSupplierDTO,
  UpdateSupplierDTO,
  SupplierDebtTransaction,
  RepaySupplierDebtDTO,
  GoodsReceipt,
  GoodsReceiptItem,
  CreateGoodsReceiptDTO,
  CreateGoodsReceiptItemDTO,
  ApiResponse,
  PaginatedResponse,
} from '@podscare/types';

export type {
  Supplier,
  CreateSupplierDTO,
  UpdateSupplierDTO,
  SupplierDebtTransaction,
  RepaySupplierDebtDTO,
  GoodsReceipt,
  GoodsReceiptItem,
  CreateGoodsReceiptDTO,
  CreateGoodsReceiptItemDTO,
};

export interface SupplierPaginationParams {
  page?: number;
  per_page?: number | 'all';
  all?: boolean;
  q?: string;
  search?: string;
  has_debt?: boolean | string;
  branch_id?: number | string;
  supplier_id?: number | string;
  status?: string;
  [key: string]: string | number | boolean | undefined;
}

function normalizeSupplierParams(
  params?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> | undefined {
  if (!params || typeof params !== 'object') {
    return undefined;
  }

  const cleanParams: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      cleanParams[key] = value;
    }
  }

  const queryText = params.q ?? params.search;
  if (queryText !== undefined && String(queryText).trim() !== '') {
    cleanParams.q = String(queryText).trim();
    cleanParams.search = String(queryText).trim();
  }

  if (params.per_page === 'all' || params.all === true) {
    cleanParams.per_page = 'all';
    cleanParams.all = true;
  }

  return Object.keys(cleanParams).length > 0 ? cleanParams : undefined;
}

export class SupplierService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  /**
   * Lấy danh sách nhà cung cấp.
   */
  async getSuppliers(
    params?: SupplierPaginationParams
  ): Promise<ApiResponse<PaginatedResponse<Supplier> | Supplier[]>> {
    return this.http.get('/api/v1/suppliers', {
      params: normalizeSupplierParams(params),
    });
  }

  /**
   * Lấy chi tiết nhà cung cấp.
   */
  async getSupplier(id: number | string): Promise<ApiResponse<Supplier>> {
    return this.http.get(`/api/v1/suppliers/${id}`);
  }

  /**
   * Tạo nhà cung cấp mới.
   */
  async createSupplier(dto: CreateSupplierDTO): Promise<ApiResponse<Supplier>> {
    return this.http.post('/api/v1/suppliers', dto);
  }

  /**
   * Cập nhật thông tin nhà cung cấp.
   */
  async updateSupplier(
    id: number | string,
    dto: UpdateSupplierDTO
  ): Promise<ApiResponse<Supplier>> {
    return this.http.put(`/api/v1/suppliers/${id}`, dto);
  }

  /**
   * Xóa hoặc ngừng hoạt động nhà cung cấp.
   */
  async deleteSupplier(id: number | string): Promise<ApiResponse<null>> {
    return this.http.delete(`/api/v1/suppliers/${id}`);
  }

  /**
   * Lập phiếu chi trả nợ nhà cung cấp.
   */
  async repayDebt(
    id: number | string,
    dto: RepaySupplierDebtDTO
  ): Promise<ApiResponse<SupplierDebtTransaction>> {
    return this.http.post(`/api/v1/suppliers/${id}/payments`, dto);
  }

  /**
   * Lấy lịch sử biến động công nợ nhà cung cấp.
   */
  async getDebtHistory(
    id: number | string,
    params?: SupplierPaginationParams
  ): Promise<ApiResponse<PaginatedResponse<SupplierDebtTransaction>>> {
    return this.http.get(`/api/v1/suppliers/${id}/debt-transactions`, {
      params: normalizeSupplierParams(params),
    });
  }

  /**
   * Lấy danh sách phiếu nhập kho linh kiện.
   */
  async getGoodsReceipts(
    params?: SupplierPaginationParams
  ): Promise<ApiResponse<PaginatedResponse<GoodsReceipt>>> {
    return this.http.get('/api/v1/goods-receipts', {
      params: normalizeSupplierParams(params),
    });
  }

  /**
   * Lấy chi tiết phiếu nhập kho linh kiện.
   */
  async getGoodsReceipt(id: number | string): Promise<ApiResponse<GoodsReceipt>> {
    return this.http.get(`/api/v1/goods-receipts/${id}`);
  }

  /**
   * Lập phiếu nhập kho linh kiện.
   */
  async createGoodsReceipt(
    dto: CreateGoodsReceiptDTO
  ): Promise<ApiResponse<GoodsReceipt>> {
    return this.http.post('/api/v1/goods-receipts', dto);
  }
}

export const supplierService = new SupplierService();
