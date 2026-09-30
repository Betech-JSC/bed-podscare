import { HttpClient, defaultHttpClient } from '../http-client';

export interface GetNotificationsParams {
  user_id?: string | number;
  branch_id?: string | number;
  is_read?: boolean;
  page?: number;
  per_page?: number;
}

export class NotificationService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  /**
   * Lấy danh sách thông báo phân trang từ backend REST API.
   * GET /api/v1/notifications
   */
  async getNotifications(params?: GetNotificationsParams): Promise<any> {
    return this.http.get('/api/v1/notifications', { params: params as any });
  }

  /**
   * Đánh dấu một thông báo đã đọc theo ID.
   * PATCH /api/v1/notifications/{id}/read
   */
  async markAsRead(id: string | number): Promise<any> {
    return this.http.patch(`/api/v1/notifications/${id}/read`);
  }

  /**
   * Đánh dấu toàn bộ thông báo đã đọc.
   * POST /api/v1/notifications/read-all
   */
  async markAllAsRead(params?: {
    user_id?: string | number;
    branch_id?: string | number;
  }): Promise<any> {
    return this.http.post('/api/v1/notifications/read-all', params);
  }
}

export const notificationService = new NotificationService();
