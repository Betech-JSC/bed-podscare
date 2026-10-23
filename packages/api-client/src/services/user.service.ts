import { HttpClient, defaultHttpClient } from '../http-client';

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: 'admin' | 'cskh' | 'technician' | 'tech' | 'qc' | 'inventory' | 'warehouse' | string;
  branch_id?: number | null;
  is_active: boolean;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
  branch?: {
    id: number;
    code: string;
    name: string;
  };
}

export interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
  phone?: string;
  branch_id?: number | string;
  role: 'admin' | 'cskh' | 'technician' | 'tech' | 'qc' | 'inventory' | 'warehouse' | string;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  branch_id?: number | string;
  role?: 'admin' | 'cskh' | 'technician' | 'tech' | 'qc' | 'inventory' | 'warehouse' | string;
  is_active?: boolean;
}

export interface UserQueryParams {
  q?: string;
  search?: string;
  role?: string;
  branch_id?: number | string;
  is_active?: boolean;
  page?: number;
  per_page?: number | 'all';
  all?: boolean;
}

export class UserService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getUsers(params?: UserQueryParams): Promise<any> {
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
      }
      if (params.per_page === 'all' || params.all === true) {
        cleanParams.per_page = 'all';
        cleanParams.all = true;
      }
    }
    return this.http.get('/api/v1/users', {
      params: Object.keys(cleanParams).length > 0 ? cleanParams : undefined,
    });
  }

  async getTechnicians(params?: {
    branch_id?: number | string;
    is_active?: boolean;
    per_page?: number | 'all';
    all?: boolean;
  }): Promise<any> {
    return this.getUsers({
      role: 'technician',
      is_active: true,
      per_page: 'all',
      all: true,
      ...params,
    });
  }

  async createUser(dto: CreateUserDTO): Promise<any> {
    return this.http.post('/api/v1/users', dto);
  }

  async updateUser(id: number | string, dto: UpdateUserDTO): Promise<any> {
    return this.http.put(`/api/v1/users/${id}`, dto);
  }

  async toggleStatus(id: number | string): Promise<any> {
    return this.http.post(`/api/v1/users/${id}/toggle-status`);
  }
}

export const userService = new UserService();
