/**
 * Chiến lược phân bổ dàn tài khoản Threads cho các bài viết mục tiêu.
 */
export type ThreadsSeedingStrategy = 'round_robin' | 'manual' | 'cluster';

/**
 * Phân loại nguồn chiến dịch Seeding.
 */
export type ThreadsCampaignType = 'discovery' | 'direct';

/**
 * Trạng thái của chiến dịch Seeding.
 */
export type ThreadsCampaignStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partially_failed'
  | 'failed';

/**
 * Trạng thái của từng job seeding đơn lẻ.
 */
export type ThreadsSeedingJobStatus =
  | 'queued'
  | 'processing'
  | 'published'
  | 'failed'
  | 'skipped';

/**
 * Chỉ số tương tác của bài viết Threads mục tiêu.
 */
export interface ThreadsTargetPostMetrics {
  replies: number;
  likes: number;
  reposts: number;
}

/**
 * Dữ liệu bài viết Threads mục tiêu được cào hoặc nhập trực tiếp.
 */
export interface ThreadsTargetPost {
  post_id: string;
  author_username: string;
  caption: string;
  published_at: string;
  permalink: string;
  metrics: ThreadsTargetPostMetrics;
  velocity_score: number;
}

/**
 * Thực thể Chiến dịch Seeding Threads.
 */
export interface ThreadsSeedingCampaign {
  id: number;
  name: string;
  type: ThreadsCampaignType;
  keyword?: string | null;
  dispatch_strategy: ThreadsSeedingStrategy;
  content_template?: string | null;
  status: ThreadsCampaignStatus;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  settings?: Record<string, unknown> | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  jobs?: ThreadsSeedingJob[];
}

/**
 * Thực thể Job Seeding Threads đơn lẻ.
 */
export interface ThreadsSeedingJob {
  id: number;
  campaign_id: number;
  account_id: number;
  target_post_id: string;
  target_post_url: string;
  target_author_username?: string | null;
  target_post_caption?: string | null;
  target_velocity_score: number;
  target_post_metrics?: ThreadsTargetPostMetrics | null;
  reply_text: string;
  content_hash: string;
  cluster_order: number;
  scheduled_at?: string | null;
  status: ThreadsSeedingJobStatus;
  container_id?: string | null;
  threads_media_id?: string | null;
  permalink?: string | null;
  published_at?: string | null;
  retry_count: number;
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  account?: {
    id: number;
    display_name: string;
    username?: string | null;
    status: string;
  };
}

/**
 * Yêu cầu tìm kiếm 10 bài hot theo từ khóa.
 */
export interface ThreadsDiscoverRequest {
  keyword: string;
  limit?: number;
}

/**
 * Phản hồi danh sách bài hot đã xếp hạng Velocity Score.
 */
export interface ThreadsDiscoverResponse {
  data: ThreadsTargetPost[];
  keyword: string;
  total: number;
}

/**
 * Yêu cầu kích hoạt Seeding từ Discovery.
 */
export interface ThreadsDispatchDiscoveryRequest {
  name: string;
  keyword: string;
  selected_posts: ThreadsTargetPost[];
  content_template: string;
  dispatch_strategy: ThreadsSeedingStrategy;
  account_ids?: number[];
  cooldown_min_seconds?: number;
  cooldown_max_seconds?: number;
}

/**
 * Yêu cầu kích hoạt Seeding trực tiếp theo danh sách URL.
 */
export interface ThreadsDispatchDirectRequest {
  name: string;
  post_urls: string[];
  reply_text: string;
  dispatch_strategy: ThreadsSeedingStrategy;
  account_ids?: number[];
  cooldown_min_seconds?: number;
  cooldown_max_seconds?: number;
}

/**
 * Phản hồi sau khi điều phối Seeding thành công.
 */
export interface ThreadsSeedingDispatchResponse {
  campaign: ThreadsSeedingCampaign;
  jobs_count: number;
  message: string;
}
