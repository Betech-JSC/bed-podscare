import { HttpClient, defaultHttpClient } from '../http-client';
import type { CreateCustomerDTO } from '@podscare/types';

export class CustomerService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getCustomers(query?: string): Promise<any> {
    return this.http.get('/api/v1/customers', { params: query ? { q: query } : undefined });
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
}

export const customerService = new CustomerService();
