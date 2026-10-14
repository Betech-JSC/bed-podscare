import { HttpClient, defaultHttpClient } from '../http-client';
import type { Customer, CreateCustomerDTO } from '@podscare/types';

export interface CustomerQueryParams {
  q?: string;
  page?: number;
  per_page?: number | 'all';
  all?: boolean;
  customer_type?: string;
}

export class CustomerService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getCustomers(params?: string | CustomerQueryParams): Promise<any> {
    if (typeof params === 'string') {
      const q = params.trim();
      return this.http.get('/api/v1/customers', { params: q ? { q } : undefined });
    }
    if (typeof params === 'object' && params !== null) {
      const cleanParams: Record<string, string | number | boolean | undefined> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          cleanParams[key] = value as string | number | boolean;
        }
      }
      return this.http.get('/api/v1/customers', {
        params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
      });
    }
    return this.http.get('/api/v1/customers');
  }

  async getCustomerById(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/customers/${id}`);
  }

  async getCustomerHistory(id: string | number): Promise<any> {
    return this.http.get(`/api/v1/customers/${id}/history`);
  }

  async createCustomer(dto: CreateCustomerDTO | Record<string, any>): Promise<any> {
    return this.http.post('/api/v1/customers', dto);
  }

  async updateCustomer(id: string | number, data: Partial<Customer> | Record<string, any>): Promise<any> {
    return this.http.put(`/api/v1/customers/${id}`, data);
  }
}

export const customerService = new CustomerService();
