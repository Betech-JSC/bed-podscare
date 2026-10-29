import { HttpClient, defaultHttpClient, RequestOptions } from '../http-client';

/**
 * Bản ghi thông báo chuẩn trả về từ Backend REST API (hỗ trợ cô lập 3 tầng & trạng thái đọc per-user).
 * Giữ tương thích ngược 100% với các trường is_read, read_at, action_url.
 */
export interface NotificationRecord {
  id: number | string;
  tenant_id?: number | null;
  user_id?: number | null;
  branch_id?: number | null;
  target_role?: string | null;
  order_id?: number | null;
  type: string;
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'danger' | 'success' | string;
  action_url?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at?: string;
  updated_at?: string;
  repair_order?: {
    id: number;
    order_code: string;
    status?: string;
    customer_id?: number | null;
  } | null;
  branch?: {
    id: number;
    name: string;
  } | null;
  user?: {
    id: number;
    name: string;
    role?: string;
  } | null;
  [key: string]: any;
}

export interface GetNotificationsParams {
  /**
   * @deprecated Backend tự động khóa cứng phạm vi theo user đang đăng nhập qua Sanctum token.
   */
  user_id?: string | number;
  branch_id?: string | number;
  is_read?: boolean | 0 | 1;
  page?: number;
  per_page?: number;
}

export interface MarkAllNotificationsReadParams {
  /**
   * @deprecated Backend tự động ghi nhận trạng thái đã đọc trong notification_reads theo user hiện tại.
   */
  user_id?: string | number;
  branch_id?: string | number;
}

export class NotificationService {
  constructor(private http: HttpClient = defaultHttpClient) {}

  /**
   * Lấy danh sách thông báo phân trang từ backend REST API (đã cô lập 3 tầng theo Sanctum token).
   * GET /api/v1/notifications
   */
  async getNotifications(
    params?: GetNotificationsParams,
    options?: Partial<RequestOptions>
  ): Promise<any> {
    return this.http.get('/api/v1/notifications', {
      params: params as any,
      skipAuthRedirect: true,
      ...options,
    });
  }

  /**
   * Đánh dấu một thông báo đã đọc theo ID cho riêng tài khoản đang đăng nhập.
   * PATCH /api/v1/notifications/{id}/read
   */
  async markAsRead(id: string | number): Promise<any> {
    return this.http.patch(`/api/v1/notifications/${id}/read`);
  }

  /**
   * Đánh dấu toàn bộ thông báo chưa đọc trong phạm vi hợp lệ của tài khoản hiện tại là đã đọc.
   * POST /api/v1/notifications/read-all
   */
  async markAllAsRead(params?: MarkAllNotificationsReadParams): Promise<any> {
    return this.http.post('/api/v1/notifications/read-all', params);
  }
}

export const notificationService = new NotificationService();
