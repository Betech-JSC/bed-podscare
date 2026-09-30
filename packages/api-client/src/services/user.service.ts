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

export class UserService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  async getUsers(params?: {
    q?: string;
    search?: string;
    role?: string;
    branch_id?: number | string;
    is_active?: boolean;
    page?: number;
    per_page?: number;
  }): Promise<any> {
    return this.http.get('/api/v1/users', {
      params: {
        ...params,
        q: params?.q || params?.search,
      },
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
