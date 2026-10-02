import { HttpClient, defaultHttpClient } from '../http-client';

export interface LoginDTO {
  store_code?: string;
  login?: string;
  email?: string;
  password?: string;
}

export class AuthService {
  private http: HttpClient;

  constructor(http: HttpClient = defaultHttpClient) {
    this.http = http;
  }

  async login(dto: LoginDTO): Promise<any> {
    return this.http.post('/api/v1/auth/login', dto);
  }

  async logout(): Promise<any> {
    return this.http.post('/api/v1/auth/logout');
  }

  async getMe(): Promise<any> {
    return this.http.get('/api/v1/auth/me');
  }
}

export const authService = new AuthService();
