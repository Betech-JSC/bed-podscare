import { HttpClient, defaultHttpClient } from '../http-client';
import type { Branch } from '@podscare/types';

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

export class BranchService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getBranches(): Promise<{ success: boolean; data: Branch[]; message?: string }> {
    return this.http.get('/api/v1/branches');
  }

  async getBranchById(id: string | number): Promise<{ success: boolean; data: BranchDetail; message?: string }> {
    return this.http.get(`/api/v1/branches/${id}`);
  }
}

export const branchService = new BranchService();
