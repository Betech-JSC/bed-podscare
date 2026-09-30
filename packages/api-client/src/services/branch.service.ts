import { HttpClient, defaultHttpClient } from '../http-client';
import type { ApiResponse, Branch } from '@podscare/types';

export interface BranchDetail extends Branch {
  users?: Array<{
    id: number;
    branch_id: number;
    name: string;
    role: string;
    phone?: string;
    avatar_url?: string;
  }>;
}

export interface CreateBranchPayload {
  code: string;
  name: string;
  address: string;
  phone?: string;
  is_active?: boolean;
}

export class BranchService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getBranches(): Promise<{ success: boolean; data: Branch[]; message?: string }> {
    return this.http.get('/api/v1/branches');
  }

  async getBranchById(id: string | number): Promise<{ success: boolean; data: BranchDetail; message?: string }> {
    return this.http.get(`/api/v1/branches/${id}`);
  }

  async createBranch(payload: CreateBranchPayload): Promise<ApiResponse<Branch>> {
    return this.http.post('/api/v1/branches', payload);
  }

  async updateBranch(id: string | number, payload: Partial<CreateBranchPayload>): Promise<ApiResponse<Branch>> {
    return this.http.put(`/api/v1/branches/${id}`, payload);
  }

  async toggleBranchStatus(id: string | number): Promise<ApiResponse<Branch>> {
    return this.http.post(`/api/v1/branches/${id}/toggle-status`);
  }
}

export const branchService = new BranchService();
