export class ApiClientError extends Error {
  public status: number;
  public data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.data = data;
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  skipAuthRedirect?: boolean;
}

export class HttpClient {
  private baseURL: string;
  private token: string | null = null;
  private isLoggingOut = false;

  constructor(baseURL?: string) {
    const envApi =
      typeof globalThis !== 'undefined'
        ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
            ?.NEXT_PUBLIC_API_URL
        : undefined;

    this.baseURL = baseURL || envApi || '';
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('podscare_token', token);
      } else {
        localStorage.removeItem('podscare_token');
        if (typeof document !== 'undefined') {
          document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';
        }
      }
    } else if (!token && typeof document !== 'undefined') {
      document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';
    }
  }

  public getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('podscare_token');
    }
    return null;
  }

  public handleUnauthorized() {
    if (this.isLoggingOut) {
      return;
    }
    this.isLoggingOut = true;
    this.setToken(null);
    if (typeof document !== 'undefined') {
      document.cookie = 'podscare_session_token=; path=/; max-age=0; SameSite=Lax';
    }
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    setTimeout(() => {
      this.isLoggingOut = false;
    }, 3000);
  }

  public buildUrl(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    const cleanBase = this.baseURL.replace(/\/+$/, '');
    let cleanEndpoint = endpoint.replace(/^\/+/, '');

    // Strip duplicate /api/v1 if both base and endpoint declare it
    if (cleanBase.endsWith('/api/v1') && cleanEndpoint.startsWith('api/v1/')) {
      cleanEndpoint = cleanEndpoint.substring('api/v1/'.length);
    } else if (cleanBase.endsWith('/api/v1') && cleanEndpoint === 'api/v1') {
      cleanEndpoint = '';
    }

    return cleanEndpoint ? `${cleanBase}/${cleanEndpoint}` : cleanBase;
  }

  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, timeoutMs = 15000, headers: customHeaders, ...fetchOptions } = options;

    let url = this.buildUrl(endpoint);

    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          searchParams.append(key, String(val));
        }
      });
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers = new Headers(customHeaders);
    if (!headers.has('Content-Type') && !(fetchOptions.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    headers.set('Accept', 'application/json');

    const token = this.getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: unknown;
        try {
          errorData = await response.json();
        } catch {
          errorData = await response.text();
        }

        if (response.status === 401) {
          if (!options.skipAuthRedirect) {
            this.handleUnauthorized();
          }
        }

        throw new ApiClientError(
          `Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof ApiClientError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Unknown network error';
      throw new ApiClientError(message, 0, err);
    }
  }

  public get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  public delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const defaultHttpClient = new HttpClient();
