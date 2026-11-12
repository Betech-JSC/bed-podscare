import { HttpClient, defaultHttpClient } from './http-client';
import type {
  ThreadsDiscoverResponse,
  ThreadsDispatchDiscoveryRequest,
  ThreadsDispatchDirectRequest,
  ThreadsSeedingDispatchResponse,
  ThreadsSeedingCampaign,
  ThreadsSeedingJob,
} from '@podscare/types';

export interface ThreadsAccountItem {
  id: number;
  username?: string | null;
  display_name: string;
  avatar_url?: string | null;
  status: 'active' | 'cooldown' | 'expired' | 'paused' | 'needs_reauth' | 'disabled';
  daily_comment_count: number;
  daily_post_cap: number;
  published_today_count?: number;
  token_days_remaining?: number | null;
  last_published_at?: string | null;
}

export class ThreadsSeedingService {
  private http: HttpClient;

  constructor(http: HttpClient = defaultHttpClient) {
    this.http = http;
  }

  /**
   * Khám phá Top 10 bài viết Threads có tương tác cao nhất trong ngày theo từ khóa
   */
  async discover(keyword: string, limit: number = 10): Promise<ThreadsDiscoverResponse> {
    const res: any = await this.http.post<any>(
      '/api/v1/threads/seeding/discover',
      { keyword, limit },
      { skipAuthRedirect: true }
    );
    if (res && res.data && Array.isArray(res.data.data)) {
      return res.data as ThreadsDiscoverResponse;
    }
    return res as ThreadsDiscoverResponse;
  }

  /**
   * Bóc tách danh sách URL bài viết Threads dán trực tiếp
   */
  async parseUrls(postUrls: string[]): Promise<any> {
    const res: any = await this.http.post<any>(
      '/api/v1/threads/seeding/parse-urls',
      { post_urls: postUrls },
      { skipAuthRedirect: true }
    );
    return res?.data ?? res;
  }

  /**
   * Kích hoạt chiến dịch Seeding tự động từ kết quả Khám phá (Discovery)
   */
  async dispatchDiscovery(
    payload: ThreadsDispatchDiscoveryRequest
  ): Promise<ThreadsSeedingDispatchResponse> {
    const res: any = await this.http.post<any>(
      '/api/v1/threads/seeding/dispatch-discovery',
      payload,
      { skipAuthRedirect: true }
    );
    if (res && res.data && (res.data.campaign || typeof res.data.jobs_count === 'number')) {
      return res.data as ThreadsSeedingDispatchResponse;
    }
    return res as ThreadsSeedingDispatchResponse;
  }

  /**
   * Kích hoạt chiến dịch Seeding trực tiếp theo danh sách URL bài viết chỉ định (Direct)
   */
  async dispatchDirect(
    payload: ThreadsDispatchDirectRequest
  ): Promise<ThreadsSeedingDispatchResponse> {
    const res: any = await this.http.post<any>(
      '/api/v1/threads/seeding/dispatch-direct',
      payload,
      { skipAuthRedirect: true }
    );
    if (res && res.data && (res.data.campaign || typeof res.data.jobs_count === 'number')) {
      return res.data as ThreadsSeedingDispatchResponse;
    }
    return res as ThreadsSeedingDispatchResponse;
  }

  /**
   * Lấy danh sách các chiến dịch Seeding đã và đang chạy
   */
  async getCampaigns(params?: {
    page?: number;
    per_page?: number;
    status?: string;
    keyword?: string;
  }): Promise<{
    data: ThreadsSeedingCampaign[];
    total?: number;
    current_page?: number;
  }> {
    return this.http.get<{
      data: ThreadsSeedingCampaign[];
      total?: number;
      current_page?: number;
    }>('/api/v1/threads/seeding/campaigns', { params, skipAuthRedirect: true });
  }

  /**
   * Lấy chi tiết chiến dịch Seeding kèm danh sách các jobs tiến độ
   */
  async getCampaignDetail(id: number | string): Promise<ThreadsSeedingCampaign> {
    const res: any = await this.http.get<any>(
      `/api/v1/threads/seeding/campaigns/${id}`,
      { skipAuthRedirect: true }
    );
    if (res && res.data && res.data.id) {
      return res.data as ThreadsSeedingCampaign;
    }
    return res as ThreadsSeedingCampaign;
  }

  /**
   * Lấy danh sách các jobs Seeding
   */
  async getJobs(params?: {
    campaign_id?: number;
    account_id?: number;
    status?: string;
    per_page?: number;
  }): Promise<{ data: ThreadsSeedingJob[] }> {
    const res: any = await this.http.get<any>('/api/v1/threads/seeding/jobs', {
      params,
      skipAuthRedirect: true,
    });
    const raw = res?.data;
    if (Array.isArray(raw)) {
      return { data: raw };
    }
    if (raw && Array.isArray(raw.data)) {
      return { data: raw.data };
    }
    return { data: [] };
  }

  /**
   * Thử lại một job Seeding bị lỗi
   */
  async retryJob(id: number | string): Promise<ThreadsSeedingJob> {
    const res: any = await this.http.post<any>(
      `/api/v1/threads/seeding/jobs/${id}/retry`,
      {},
      { skipAuthRedirect: true }
    );
    return (res?.data ?? res) as ThreadsSeedingJob;
  }

  /**
   * Lấy danh sách tài khoản Threads nội bộ để theo dõi trạng thái kho nick
   */
  async getAccounts(): Promise<{ data: ThreadsAccountItem[] }> {
    const res: any = await this.http.get<any>('/api/v1/threads/accounts', {
      skipAuthRedirect: true,
    });
    const rawList = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.data?.accounts)
        ? res.data.accounts
        : Array.isArray(res)
          ? res
          : [];

    const normalized: ThreadsAccountItem[] = rawList.map((acc: any) => ({
      id: Number(acc.id),
      username: acc.username ?? null,
      display_name: acc.display_name || acc.username || `Tài khoản #${acc.id}`,
      avatar_url: acc.avatar_url ?? null,
      status: acc.status || 'active',
      daily_comment_count: Number(
        acc.daily_comment_count ?? acc.published_today_count ?? acc.published_today ?? 0
      ),
      daily_post_cap: Number(acc.daily_post_cap ?? 8),
      published_today_count: Number(acc.published_today_count ?? 0),
      token_days_remaining: acc.token_days_remaining ?? null,
      last_published_at: acc.last_published_at ?? null,
    }));

    return { data: normalized };
  }
}

export const threadsSeedingService = new ThreadsSeedingService();

