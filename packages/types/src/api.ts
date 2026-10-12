export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page?: number;
  limit?: number;
  last_page?: number;
  current_page?: number;
  per_page?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
