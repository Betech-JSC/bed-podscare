import { HttpClient, defaultHttpClient } from '../http-client';
import type {
  CashTransaction,
  CashTransactionFilterParams,
  CreateExpenseDTO,
  CashCategoriesResponse,
  BranchCashBalance,
  ApiResponse,
  PaginatedResponse,
} from '@podscare/types';

export class CashbookService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  /**
   * Lấy danh sách giao dịch sổ quỹ tiền mặt (phân trang, bộ lọc chi nhánh, ca, loại thu/chi, tìm kiếm q).
   */
  async getTransactions(
    params?: CashTransactionFilterParams
  ): Promise<ApiResponse<PaginatedResponse<CashTransaction>>> {
    const cleanParams: Record<string, string | number | boolean> = {};
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== '') {
          cleanParams[key] = val as string | number | boolean;
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
    }
    return this.http.get('/api/v1/cashbook/transactions', {
      params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    });
  }

  /**
   * Lập phiếu chi tiền mặt ngoài két (mua linh kiện, vận hành, cod...).
   */
  async createExpense(
    dto: CreateExpenseDTO
  ): Promise<ApiResponse<CashTransaction>> {
    return this.http.post('/api/v1/cashbook/expenses', dto);
  }

  /**
   * Lấy danh mục thu/chi chuẩn từ hệ thống.
   */
  async getCategories(): Promise<ApiResponse<CashCategoriesResponse>> {
    return this.http.get('/api/v1/cashbook/categories');
  }

  /**
   * Lấy thông tin tồn quỹ tiền mặt và trạng thái ca của chi nhánh.
   */
  async getBranchBalance(
    branchId?: number | string
  ): Promise<ApiResponse<BranchCashBalance>> {
    return this.http.get('/api/v1/cashbook/balance', {
      params: branchId !== undefined ? { branch_id: branchId } : undefined,
    });
  }
}

export const cashbookService = new CashbookService();
