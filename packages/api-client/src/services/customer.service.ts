import { HttpClient, defaultHttpClient } from '../http-client';
import type { Customer, CreateCustomerDTO } from '@podscare/types';

export interface CustomerQueryParams {
  q?: string;
  search?: string;
  page?: number;
  per_page?: number | 'all';
  all?: boolean;
  customer_type?: string;
}

export interface CustomerOrderHistoryParams {
  page?: number;
  per_page?: number | 'all';
  all?: boolean;
  q?: string;
  search?: string;
}

function normalizeCustomerPaginationParams(
  params?: Record<string, string | number | boolean | undefined>
): Record<string, string | number | boolean> | undefined {
  if (!params || typeof params !== 'object') {
    return undefined;
  }
  const cleanParams: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      cleanParams[key] = value as string | number | boolean;
    }
  }
  const queryText = params.q ?? params.search;
  if (queryText !== undefined && String(queryText).trim() !== '') {
    cleanParams.q = String(queryText).trim();
  }
  if (params.per_page === 'all' || params.all === true) {
    cleanParams.per_page = 'all';
    cleanParams.all = true;
  }
  return Object.keys(cleanParams).length > 0 ? cleanParams : undefined;
}

export class CustomerService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getCustomers(params?: string | CustomerQueryParams): Promise<any> {
    if (typeof params === 'string') {
      const q = params.trim();
      return this.http.get('/api/v1/customers', { params: q ? { q } : undefined });
    }
    if (typeof params === 'object' && params !== null) {
      return this.http.get('/api/v1/customers', {
        params: normalizeCustomerPaginationParams(
          params as Record<string, string | number | boolean | undefined>
        ),
      });
    }
    return this.http.get('/api/v1/customers');
  }

  async getCustomerById(id: string | number, params?: CustomerOrderHistoryParams): Promise<any> {
    return this.http.get(`/api/v1/customers/${id}`, {
      params: normalizeCustomerPaginationParams(
        params as Record<string, string | number | boolean | undefined>
      ),
    });
  }

  async getCustomerOrders(id: string | number, params?: CustomerOrderHistoryParams): Promise<any> {
    return this.http.get(`/api/v1/customers/${id}/orders`, {
      params: normalizeCustomerPaginationParams(
        params as Record<string, string | number | boolean | undefined>
      ),
    });
  }

  async getCustomerHistory(id: string | number, params?: CustomerOrderHistoryParams): Promise<any> {
    return this.http.get(`/api/v1/customers/${id}/history`, {
      params: normalizeCustomerPaginationParams(
        params as Record<string, string | number | boolean | undefined>
      ),
    });
  }

  async createCustomer(dto: CreateCustomerDTO | Record<string, any>): Promise<any> {
    return this.http.post('/api/v1/customers', dto);
  }

  async updateCustomer(id: string | number, data: Partial<Customer> | Record<string, any>): Promise<any> {
    return this.http.put(`/api/v1/customers/${id}`, data);
  }
}

export const customerService = new CustomerService();
